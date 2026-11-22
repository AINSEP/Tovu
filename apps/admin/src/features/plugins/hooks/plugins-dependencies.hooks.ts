import type { AdminPlugin, AdminPluginFiles, AdminPluginProviderSettings } from "@/features/plugins/api/plugins-api.types";
import { pluginsApi } from "@/features/plugins/api/plugins-api";
import { providersApi } from "@/features/providers/api/providers-api";
import { ApiError, authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { providerSettingRequiredHere } from "../rules";
import type { PluginsPort } from "./plugins-port.hooks";

/**
 * @file The only place under `features/plugins`'s screen hook that reaches `lib/api` — see
 * `plugins-port.hooks.ts` for why the split exists. (`AgentPlugins.tsx` is a separate screen, with
 * its own port at `agent-plugins-dependencies.hooks.ts` — out of scope here.)
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. */
export const defaultPluginsPort: PluginsPort = {
  useProjectKey: (input, _optional = {}) => providersApi.useProjectKey(input),
  listPlugins: () => authenticatedAdminRequest({ path: `/workspaces/${WORKSPACE_ID}/plugins`, method: "GET" }),
  setPluginEnabled: ({ id, patch }, _optional = {}) => pluginsApi.setPluginEnabled({ pluginId: id, enabled: patch.enabled }),
  uninstallPlugin: ({ id }, _optional = {}) => pluginsApi.uninstallPlugin({ pluginId: id }),
  getPluginFiles: ({ id }, _optional = {}) => pluginsApi.getPluginFiles({ pluginId: id }),
  getProviderSettings: ({ id }, _optional = {}) => pluginsApi.getPluginProviderSettings({ pluginId: id }),
  saveProviderSettings: ({ id, values }, _optional = {}) => pluginsApi.savePluginProviderSettings({ pluginId: id, values }),
};

/** Seed state for {@link createFakePluginsPort}. */
export interface FakePluginsPortOptions {
  installSources?: string[];
  plugins?: AdminPlugin[];
  /** `PLUGIN_FILES` responses by plugin id; an id with no entry rejects like the real route's 404. */
  packageFiles?: Record<string, AdminPluginFiles>;
  /** Provider settings cards by plugin id; saves follow the real route's rules (blank secret = keep). */
  providerSettings?: Record<string, AdminPluginProviderSettings>;
}

/**
 * An in-memory {@link PluginsPort} for tests — the fake that lets a test describe "the list has
 * these two plugins" directly, instead of hand-building `Response` objects and stubbing global
 * `fetch`. Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 *
 * `uninstallPlugin` re-implements the real route's own two preconditions (`uninstallPlugin()`,
 * `Jini packages/plugins/src/host/uninstall.ts`) rather than always succeeding: a fake that skipped them
 * would let a component test "confirm the built-in refusal" only by asserting against a mocked
 * rejection, never against the same rule the real server enforces. Thrown as `ApiError` with the
 * real route's own `code`s, so `rules.ts`'s `describeApiError` maps them exactly as it would the
 * live response.
 */
export function createFakePluginsPort(options: FakePluginsPortOptions = {}): PluginsPort & {
  /** Every plugin currently in the fake's store, in list order. */
  readonly plugins: AdminPlugin[];
} {
  return createFakePluginsStore({ options });
}

function createFakePluginsStore(
  { options }:
    { options: NonNullable<Parameters<typeof createFakePluginsPort>[0]> }
): ReturnType<typeof createFakePluginsPort> {
  const plugins = [...(options.plugins ?? [])];
  const trashedPluginIds = new Set<string>();

  return {
    plugins,
    ...createFakePluginLifecycle({ options, plugins, trashedPluginIds }),
    ...createFakePluginReads({ options }),

    async saveProviderSettings({ id, values }, _optional = {}) {
      const card = await this.getProviderSettings({ id });
      if (Object.entries(values).some(([name]) => !card.fields.some((field) => field.name === name))) {
        throw new ApiError({ message: "values must map declared setting names to text", status: 400 }, { code: "PROVIDER_SETTINGS_INVALID" });
      }
      // Like the server: a blank secret is kept only while every public field is unchanged (a blank
      // public field means its declared default, so filling in that default is no change).
      const effective = ({ field, value }: { field: (typeof card.fields)[number]; value: string | undefined }, _optional = {}) => value || field.default || "";
      const effectiveFieldValue = ({ field, entered }: { field: (typeof card.fields)[number]; entered: string | undefined }, _optional = {}) => {
        if (!field.secret) return effective({ field, value: entered ?? field.value });
        if (entered) return entered;
        return field.saved ? "saved" : "";
      };
      const changed = card.fields.filter((field) => {
        const value = values[field.name];
        return !field.secret && value !== undefined && effective({ field, value: value.trim() }) !== effective({ field, value: field.value });
      });
      const kept = card.fields.filter((field) => field.secret && field.saved && !values[field.name]?.trim());
      if (changed.length > 0 && kept.length > 0) {
        const labels = (list: typeof kept) => list.map((field) => field.label).join(", ");
        throw new ApiError({ message: `Changing ${labels(changed)} needs ${labels(kept)} entered again.`, status: 400 }, { code: "PROVIDER_SETTINGS_SECRET_REENTRY" });
      }
      const effectiveValues = Object.fromEntries(card.fields.map((field) => [field.name, effectiveFieldValue({ field, entered: values[field.name]?.trim() })]));
      const missing = card.fields.find((field) => providerSettingRequiredHere({ field, fields: card.fields, entered: values, values: effectiveValues }) && !effectiveValues[field.name]);
      if (missing) throw new ApiError({ message: `${missing.label} is required.${missing.hint ? " " + missing.hint : ""}`, status: 400 }, { code: "PROVIDER_SETTINGS_REQUIRED" });
      const fields = card.fields.map((field) => {
        const value = values[field.name]?.trim();
        if (value === undefined) return field;
        if (field.secret) return { ...field, saved: field.saved || value !== "" };
        return { ...field, value, saved: value !== "" };
      });
      // Like the server: once settings are saved, the retired-key and can't-read notices are gone.
      const { legacyCredential: _retired, unreadable: _unreadable, ...current } = card;
      const providerSettings = options.providerSettings;
      if (!providerSettings) throw new ApiError({ message: "this plugin declares no provider settings", status: 404 }, { code: "PLUGIN_NOT_FOUND" });
      const updated = { ...current, fields };
      providerSettings[id] = updated;
      return updated;
    },
  };
}

function createFakePluginReads(
  { options }:
    Pick<Parameters<typeof createFakePluginsStore>[0], "options">
): Pick<PluginsPort, "getPluginFiles" | "getProviderSettings"> {
  return {

    async getPluginFiles({ id }, _optional = {}) {
      const listing = options.packageFiles?.[id];
      if (!listing) throw new ApiError({ message: "plugin was not found", status: 404 }, { code: "PLUGIN_NOT_FOUND" });
      return listing;
    },

    async getProviderSettings({ id }, _optional = {}) {
      const card = options.providerSettings?.[id];
      if (!card) throw new ApiError({ message: "this plugin declares no provider settings", status: 404 }, { code: "PLUGIN_NOT_FOUND" });
      return card;
    },
  };
}

function createFakePluginLifecycle(
  { options, plugins, trashedPluginIds }:
    Pick<Parameters<typeof createFakePluginsStore>[0], "options"> &
    { plugins: AdminPlugin[]; trashedPluginIds: Set<string> }
): Pick<PluginsPort, "useProjectKey" | "listPlugins" | "setPluginEnabled" | "uninstallPlugin"> {
  return {
    async useProjectKey({ keyId, use }, _optional = {}) {
      const card = Object.values(options.providerSettings ?? {}).find(card => card.keyId === keyId);
      if (!card) throw new ApiError({ message: "project key not found", status: 404 }, { code: "KEY_NOT_FOUND" });
      card.usedByThisSite = use;
      card.usedBy = use ? ["this-site"] : [];
      return { keyId, usedByThisSite: use, usedBy: card.usedBy, appliesAt: "now" };
    },

    async listPlugins() {
      return { plugins: [...plugins], ...(options.installSources ? { installSources: options.installSources } : {}) };
    },

    async setPluginEnabled({ id, patch }, _optional = {}) {
      const index = plugins.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake plugin not found: ${id}`);
      // The real enable gate (`onPluginEnabled`, 2026-10-04): a plugin whose row lists conflicts is
      // refused with 409 PLUGIN_CONFLICT and stays off. Turning a plugin OFF is never refused.
      if (patch.enabled && (plugins[index].conflicts ?? []).length > 0) {
        throw new ApiError({ message: `Plugin '${id}' was not turned on because it claims things already in use.`, status: 409 }, { code: "PLUGIN_CONFLICT" });
      }
      const updated = { ...plugins[index], enabled: patch.enabled };
      plugins[index] = updated;
      // Matches the real route's own narrow echo shape — see `PluginsPort.setPluginEnabled`'s doc.
      return { plugin: { id: updated.id, version: "1", enabled: updated.enabled, updatedAt: new Date(0).toISOString() }, changeSetId: "fake-cs-1" };
    },

    async uninstallPlugin({ id }, _optional = {}) {
      if (trashedPluginIds.has(id)) {
        throw new ApiError({ message: "plugin is already in Trash", status: 409 }, { code: "PLUGIN_IN_TRASH" });
      }
      const index = plugins.findIndex((p) => p.id === id);
      if (index < 0) throw new ApiError({ message: "plugin not found", status: 404 }, { code: "PLUGIN_NOT_FOUND" });
      const plugin = plugins[index];
      if (plugin.source === "built-in") {
        throw new ApiError({ message: `plugin '${id}' is a built-in plugin and cannot be uninstalled`, status: 422 }, { code: "PLUGIN_NOT_UNINSTALLABLE" });
      }
      if (plugin.enabled) {
        throw new ApiError({ message: `plugin '${id}' is enabled and must be disabled everywhere before it can be uninstalled`, status: 409 }, { code: "PLUGIN_ENABLED" });
      }
      trashedPluginIds.add(id);
      plugins.splice(index, 1);
      return { pluginId: id, trashed: true };
    },
  };
}
