import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { t as translate } from "@jini-ai/admin/screens/plugins/plugins-memory-i18n";
import { useAgentPluginMemory } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-memory.hooks";
import { defaultAgentPluginMemoryPort } from "./agent-plugin-memory-dependencies.hooks";

/**
 * @file The host binding of `useAgentPluginMemory` (the hook itself lives in `@jini-ai/admin`): the
 * real memory client, the admin locale's translator and this host's API-error describer.
 */

export function useWiredAgentPluginMemory({ pluginId }: { pluginId: string }, _optional = {}) {
  const locale = useAdminLocale();
  return useAgentPluginMemory({ pluginId, port: defaultAgentPluginMemoryPort, t: key => translate({ locale: locale, key: key }), describeApiError });
}
