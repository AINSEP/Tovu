import type { AdminPlugin, AdminPluginFiles } from "@/lib/api";

/**
 * @file What `use-plugins.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented on
 * `assistant-chats-port.hooks.ts` (the canonical reference in this workspace) and the shape
 * `redirects-port.hooks.ts` uses for a single-hook feature.
 *
 * `describeApiError` is deliberately NOT part of this port — a pure error-message rule with no
 * I/O, imported directly per the pattern's own carve-out (see `redirects-port.hooks.ts`'s
 * identical note).
 */
export interface PluginsPort {
  listPlugins(): Promise<{ plugins: AdminPlugin[] }>;
  /** The route's own response is a partial patch echo (`id`/`version`/`enabled`/`updatedAt`) plus a
   *  `changeSetId`, not a full `AdminPlugin` — `use-plugins.hooks.ts` never reads it, always
   *  re-fetching the authoritative list via `reload()` afterward. Kept exactly as narrow as the
   *  real route and the one caller need. */
  setPluginEnabled(
    id: string,
    patch: { enabled: boolean }
  ): Promise<{ plugin: { id: string; version: string; enabled: boolean; updatedAt: string }; changeSetId: string }>;
  /** `PLUGIN_UNINSTALL` (`DELETE /workspaces/:id/plugins/:pluginId`) — deletes a `"site"` plugin's
   *  on-disk artifact and every workspace's activation row for it. Refuses a `"built-in"` plugin
   *  (`PLUGIN_NOT_UNINSTALLABLE`) and a plugin still enabled somewhere (`PLUGIN_ENABLED`) — see
   *  `features/plugin-runtime/uninstall.ts`'s own two preconditions. The Downloaded tab's own
   *  `usePlugins` caller re-fetches the list afterward (`reload()`), the same "echo is narrow,
   *  re-fetch is authoritative" convention `setPluginEnabled` above already uses, rather than
   *  reading `clearedWorkspaceIds` itself. */
  uninstallPlugin(id: string): Promise<{ pluginId: string; clearedWorkspaceIds: string[] }>;
  /** `PLUGIN_FILES` (`GET /workspaces/:id/plugins/:pluginId/files`) — the read-only package-files
   *  listing behind `PluginPackageFilesModal`. */
  getPluginFiles(id: string): Promise<AdminPluginFiles>;
}
