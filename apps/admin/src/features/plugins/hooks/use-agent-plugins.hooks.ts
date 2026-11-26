import { useAgentPlugins as jiniUseAgentPlugins, useWiredAgentPlugins as jiniUseWiredAgentPlugins, type AgentPluginsController } from "@jini-ai/agent-plugins/react/use-agent-plugins.hooks";
import { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { ApiError, describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { tPlugins as translatePlugins } from "../../../lib/i18n-common";
import { defaultAgentPluginsPort } from "./agent-plugins-dependencies.hooks";
import type { AgentPluginsPort } from "@jini-ai/admin/screens/integrations/agent-plugin-ports";
import { AGENT_PLUGINS_RESOURCE } from "../rules";
import { type Translate } from '@jini-ai/core/text';

export interface AgentPluginsDependencies {
  port: AgentPluginsPort;
  locale: string;
  t: Translate;
}

const TOGGLE_REFUSAL_KEYS: Readonly<Record<string, string>> = {
  PLUGIN_HOST_INCOMPATIBLE: "This plugin is not made for this Tovu version.",
  PLUGIN_UPDATE_PENDING: "An earlier update is still being recovered. Restart Tovu and try again.",
};

export function useAgentPlugins({ port, locale, t }: AgentPluginsDependencies): AgentPluginsController {
  return jiniUseAgentPlugins({ port, locale, t, useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate, useContentRefreshSubscription, resource: AGENT_PLUGINS_RESOURCE, toggleRefusalKeys: TOGGLE_REFUSAL_KEYS, translatePlugins, describeApiError, isApiError: (error): error is ApiError => error instanceof ApiError });
}

/**
 * Binds the real `/api/.../agent-plugins` client and the real `useAdminLocale()` — see
 * `agent-plugins-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `AgentPlugins.tsx` composes this and a test composes {@link useAgentPlugins} with
 * `createFakeAgentPluginsPort`.
 */
export function useWiredAgentPlugins(): AgentPluginsController {
  return jiniUseWiredAgentPlugins({ useAdminLocaleHook: useAdminLocale, port: defaultAgentPluginsPort, useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate, useContentRefreshSubscription, resource: AGENT_PLUGINS_RESOURCE, toggleRefusalKeys: TOGGLE_REFUSAL_KEYS, translatePlugins, describeApiError, isApiError: (error): error is ApiError => error instanceof ApiError });
}
