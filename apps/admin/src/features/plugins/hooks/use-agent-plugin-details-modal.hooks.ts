import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { t as translate } from "../plugins-i18n";
import { defaultAgentPluginsPort } from "./agent-plugins-dependencies.hooks";
import type { AgentPluginsPort } from "./agent-plugins-port.hooks";
import { usePluginPackageFiles, type PluginPackageFilesController } from "./use-plugin-package-files.hooks";

/**
 * @file `AgentPluginDetailsModal`'s data: one `AGENT_PLUGIN_FILES` read for the inspected plugin,
 * mapped onto the shared viewer's rows, plus which file is selected.
 *
 * REWRITTEN 2026-09-13: this hook used to read `agent-plugin-source-catalog.ts`, a compile-time list
 * that knew only the plugins someone had hand-added — `supabase` and `tovuize-site` had no entry, so
 * their eye button opened an empty viewer. It now reads the installed package from the server and
 * delegates to the Plugins screen's own `usePluginPackageFiles`, so every installed plugin (switched
 * on or off) shows its real files, and the stale-read and selection handling exist once.
 *
 * `useX(dependencies)` / `useWiredX()` pair: a test composes {@link useAgentPluginDetailsModal} with
 * `createFakeAgentPluginsPort`.
 */

/** What `AgentPluginDetailsModal` renders from. `status`/`listNotice` are optional so a rendering
 *  test's fake can supply just a file list; absent reads as nothing to report. */
export type AgentPluginDetailsModalController = Pick<PluginPackageFilesController, "files" | "selectedFile" | "selectFile"> &
  Partial<Pick<PluginPackageFilesController, "status" | "listNotice">>;

export interface AgentPluginDetailsModalDependencies {
  readonly pluginId: string;
  readonly port: Pick<AgentPluginsPort, "getAgentPluginFiles">;
  readonly t: Translate;
}

/**
 * Loads one installed Agent Plugin's package files once per `pluginId`.
 *
 * @complexity One GET per `pluginId`; O(files) per render (capped server-side at 200) — see
 * {@link usePluginPackageFiles}.
 */
export function useAgentPluginDetailsModal({ pluginId, port, t }: AgentPluginDetailsModalDependencies): PluginPackageFilesController {
  return usePluginPackageFiles({ pluginId, port: { getPluginFiles: (id) => port.getAgentPluginFiles(id) }, t });
}

/** Binds the real `/api/.../agent-plugins/:id/files` client and a `plugins-i18n.ts` translator for
 *  the current admin locale. */
export function useWiredAgentPluginDetailsModal(pluginId: string): PluginPackageFilesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return useAgentPluginDetailsModal({ pluginId, port: defaultAgentPluginsPort, t });
}
