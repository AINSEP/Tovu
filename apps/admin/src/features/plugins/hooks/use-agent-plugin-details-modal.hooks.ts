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

/** Binds the real `/api/.../agent-plugins/:id/files` client and a `translatePlugins` translator for
 *  the current admin locale. */
export function useWiredAgentPluginDetailsModal({ pluginId }: { pluginId: string }, _optional = {}): PluginPackageFilesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return useAgentPluginDetailsModal({ pluginId, port: defaultAgentPluginsPort, t, rules: pluginRules });
}
