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

export interface ProviderConfigSource {
  /** Which store this is, for the admin card ("saved for this project" vs "this site"). */
  readonly scope: "project" | "site";
  /** Null when nothing was ever saved for the plugin. */
  read(required: { pluginId: string }, optional?: Record<string, never>): Promise<ProviderPluginConfig | null>;
  /** Public values only (no secret is decrypted); null when nothing was saved. */
  readSettings(required: { pluginId: string }, optional?: Record<string, never>): Promise<{ settings: Readonly<Record<string, string>>; secretNames: readonly string[] } | null>;
  write(required: { pluginId: string; config: ProviderPluginConfig }, optional?: Record<string, never>): Promise<void>;
}

const CONFIG_KEY = "provider.config";

const stringRecord = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

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
  async function read({ pluginId }: { pluginId: string }): Promise<ProviderPluginConfig | null> {
    const row = (await store({ pluginId }).get({ key: CONFIG_KEY })) as { settings?: unknown; secrets?: unknown } | null;
    if (!row || typeof row !== "object") return null;
    return { settings: stringRecord(row.settings) ?? {}, secrets: stringRecord(row.secrets) ?? {} };
  }
  return {
    scope: required.scope,
    read,
    async readSettings({ pluginId }) {
      const found = await read({ pluginId });
      if (!found) return null;
      return { settings: found.settings, secretNames: Object.keys(found.secrets).filter((name) => found.secrets[name] !== "") };
    },
    async write({ pluginId, config }) {
      await store({ pluginId }).set({ key: CONFIG_KEY, value: { settings: { ...config.settings }, secrets: { ...config.secrets } } });
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
