import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { usePluginPackageFiles, type PluginPackageFilesController } from "@jini-ai/admin/screens/plugins/hooks/use-plugin-package-files.hooks";

import { tPlugins as translate } from "../../../lib/i18n-common";
import { pluginRules } from "../rules";
import { defaultPluginsPort } from "./plugins-dependencies.hooks";

/**
 * @file The host binding of Jini's `usePluginPackageFiles`: this product's `PLUGIN_FILES` client, the
 * current admin locale's plugins dictionary and its bound rule functions.
 */

/** Binds the real `/api/.../plugins/:id/files` client and a `translatePlugins` translator for the
 *  current admin locale. */
export function useWiredPluginPackageFiles({ pluginId }: { pluginId: string }, _optional = {}): PluginPackageFilesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return usePluginPackageFiles({ pluginId, port: defaultPluginsPort, t, rules: pluginRules });
}
