import { useCallback, useMemo, useState } from "react";

import type { AdminTokenSignInPlugin } from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { KEYS, tokensForCreate } from "../rules";
import type { SitesPort } from "./sites-port.hooks";

/**
 * @file The create form's optional "connect a service now" fields (2026-09-29, owner: "the option of
 * supabase if they have an access token; if not they can create it later").
 *
 * Which services are offered comes from the server (`GET .../system/sites/token-sign-in-plugins`):
 * every installed Agent Plugin that takes a pasted access token, with its own tokens page. Nothing
 * here names a vendor. A token typed here is sent with the create request, checked by the server
 * before the site is made, and applied when the new site first starts. An empty field means "skip":
 * the site is created exactly as before and the person connects later from chat.
 *
 * Tokens live only in this hook's state until the create request is sent, and are cleared after a
 * successful create.
 */

export interface CreateSitePluginTokenField extends AdminTokenSignInPlugin {
  /** What is typed in the field right now. */
  token: string;
}

export interface CreateSitePluginTokensController {
  /** One field per offered plugin; empty while the list loads or when none are installed. */
  fields: CreateSitePluginTokenField[];
  setToken: (pluginId: string, value: string) => void;
  /** The non-empty tokens as the create body's `agentPluginTokens`, or `undefined` when none. */
  tokensForCreate: () => Record<string, string> | undefined;
  /** Display names of the given plugin ids, for the "will connect" line. */
  displayNames: (pluginIds: readonly string[]) => string[];
  clear: () => void;
}

export function useCreateSitePluginTokens(port: SitesPort): CreateSitePluginTokensController {
  const list = useFetchQuery({ key: KEYS.tokenSignInPlugins, fetch: () => port.listTokenSignInPlugins() });
  const [tokens, setTokens] = useState<Record<string, string>>({});

  const plugins = list.data?.plugins;
  const fields = useMemo(() => (plugins ?? []).map((plugin) => ({ ...plugin, token: tokens[plugin.pluginId] ?? "" })), [plugins, tokens]);

  const setToken = useCallback((pluginId: string, value: string) => setTokens((prev) => ({ ...prev, [pluginId]: value })), []);
  const clear = useCallback(() => setTokens({}), []);
  const collect = useCallback(() => tokensForCreate(tokens), [tokens]);
  const displayNames = useCallback(
    (pluginIds: readonly string[]) => pluginIds.map((id) => (plugins ?? []).find((plugin) => plugin.pluginId === id)?.displayName ?? id),
    [plugins],
  );

  return { fields, setToken, tokensForCreate: collect, displayNames, clear };
}
