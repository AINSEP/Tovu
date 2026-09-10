import { ApiError, api, type AdminPlugin } from "@/lib/api";
import type { PluginsPort } from "./plugins-port.hooks";

/**
 * @file The only place under `features/plugins`'s screen hook that reaches `lib/api` — see
 * `plugins-port.hooks.ts` for why the split exists. (`AgentPlugins.tsx` is a separate screen, with
 * its own port at `agent-plugins-dependencies.hooks.ts` — out of scope here.)
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultPluginsPort: PluginsPort = {
  listPlugins: () => api.listPlugins(),
  setPluginEnabled: (id, patch) => api.setPluginEnabled(id, patch),
  uninstallPlugin: (id) => api.uninstallPlugin(id),
};

/** Seed state for {@link createFakePluginsPort}. */
export interface FakePluginsPortOptions {
  plugins?: AdminPlugin[];
}

/**
 * An in-memory {@link PluginsPort} for tests — the fake that lets a test describe "the list has
 * these two plugins" directly, instead of hand-building `Response` objects and stubbing global
 * `fetch`. Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 *
 * `uninstallPlugin` re-implements the real route's own two preconditions (`uninstallPlugin()`,
 * `features/plugin-runtime/uninstall.ts`) rather than always succeeding: a fake that skipped them
 * would let a component test "confirm the built-in refusal" only by asserting against a mocked
 * rejection, never against the same rule the real server enforces. Thrown as `ApiError` with the
 * real route's own `code`s, so `rules.ts`'s `describeApiError` maps them exactly as it would the
 * live response.
 */
export function createFakePluginsPort(options: FakePluginsPortOptions = {}): PluginsPort & {
  /** Every plugin currently in the fake's store, in list order. */
  readonly plugins: AdminPlugin[];
} {
  const plugins = [...(options.plugins ?? [])];

  return {
    plugins,

    async listPlugins() {
      return { plugins: [...plugins] };
    },

    async setPluginEnabled(id, patch) {
      const index = plugins.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake plugin not found: ${id}`);
      const updated = { ...plugins[index]!, enabled: patch.enabled };
      plugins[index] = updated;
      // Matches the real route's own narrow echo shape — see `PluginsPort.setPluginEnabled`'s doc.
      return { plugin: { id: updated.id, version: "1", enabled: updated.enabled, updatedAt: new Date(0).toISOString() }, changeSetId: "fake-cs-1" };
    },

    async uninstallPlugin(id) {
      const index = plugins.findIndex((p) => p.id === id);
      if (index < 0) throw new ApiError("plugin not found", 404, "PLUGIN_NOT_FOUND");
      const plugin = plugins[index]!;
      if (plugin.source === "built-in") {
        throw new ApiError(`plugin '${id}' is a built-in plugin and cannot be uninstalled`, 422, "PLUGIN_NOT_UNINSTALLABLE");
      }
      if (plugin.enabled) {
        throw new ApiError(`plugin '${id}' is enabled and must be disabled everywhere before it can be uninstalled`, 409, "PLUGIN_ENABLED");
      }
      plugins.splice(index, 1);
      return { pluginId: id, clearedWorkspaceIds: [] };
    },
  };
}
