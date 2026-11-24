import { useState } from "react";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { usePluginProviderSettings, type PluginProviderSettingsController } from "@jini-ai/admin/screens/plugins/hooks/use-plugin-provider-settings.hooks";

import { tPlugins as translate } from "../../../lib/i18n-common";
import { describeApiError } from "../rules";
import { defaultPluginsPort } from "./plugins-dependencies.hooks";

/**
 * @file The host binding of `usePluginProviderSettings` (the hook itself lives in
 * `@jini-ai/admin`): the real plugins client, the admin locale's translator and the plugins
 * screen's own error describer.
 */

/** Binds the real `/api/.../plugins/:id/provider-settings` client and the admin locale's translator. */
export function useWiredPluginProviderSettings({ pluginId }: { pluginId: string }, _optional = {}): PluginProviderSettingsController {
  const locale = useAdminLocale();
  const [t] = useState(() => (key: string): string => translate({ locale, key }));
  return usePluginProviderSettings({ pluginId, port: defaultPluginsPort, t, describeApiError });
}
