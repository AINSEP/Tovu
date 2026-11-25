import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useAgentPluginDetailsModal } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-details-modal.hooks";
import type { PluginPackageFilesController } from "@jini-ai/admin/screens/plugins/hooks/use-plugin-package-files.hooks";

import { tPlugins as translate } from "../../../lib/i18n-common";
import { pluginRules } from "../rules";
import { defaultAgentPluginsPort } from "./agent-plugins-dependencies.hooks";

/**
 * @file The host binding of Jini's `useAgentPluginDetailsModal`: this product's
 * `/api/.../agent-plugins/:id/files` client, the current admin locale's plugins dictionary and its
 * bound rule functions.
 */
/*
 * Original header of the pre-move hook, kept because it names host plugins (the 2026-09-13 rewrite
 * motivation) that explain why this binding exists. */
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

/** Binds the real `/api/.../agent-plugins/:id/files` client and a `translatePlugins` translator for
 *  the current admin locale. */
export function useWiredAgentPluginDetailsModal({ pluginId }: { pluginId: string }, _optional = {}): PluginPackageFilesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return useAgentPluginDetailsModal({ pluginId, port: defaultAgentPluginsPort, t, rules: pluginRules });
}
