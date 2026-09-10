import { useEffect, useState } from "react";

import { describeApiError, type AdminAgentPlugin } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translatePlugins } from "../plugins-i18n";
import { defaultAgentPluginsPort } from "./agent-plugins-dependencies.hooks";
import type { AgentPluginsPort } from "./agent-plugins-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file State for the Agent Plugins screen, so `AgentPlugins.tsx` is only markup — same split as
 * this directory's own `use-plugins.hooks.ts` (`Plugins.tsx`'s hook).
 *
 * REWRITTEN 2026-09-09: this hook used to return the static, checked-in `TOVU_BUNDLED_AGENT_PLUGINS`
 * constant with no I/O at all (the module's own prior header said so explicitly: "a port would be
 * ceremony with nothing to inject"). That premise is gone — `AGENT_PLUGINS_LIST`
 * (`server/inbound/admin-http/routes/agent-plugins/list.ts`) now exists, so this hook has a real
 * host boundary to inject, and gets the same `port` (`AgentPluginsPort`) / `useX(dependencies)` /
 * `useWiredX()` split `use-plugins.hooks.ts` already uses for this feature's sibling screen.
 *
 * `describeApiError` here is the shared default from `lib/api.ts`, not this feature's
 * `rules.ts` override — that override's `PLUGIN_NOT_FOUND`/`PLUGIN_INVALID`/`PLUGIN_INCOMPATIBLE`
 * codes belong to the `.tovu-plugin` enable/disable route this screen does not call; a plain read
 * has no comparable error taxonomy to layer on top of the server's own message.
 *
 * `t` (standing i18n rule, 2026-08-11): resolved from `useAdminLocale()` in `useWiredAgentPlugins`
 * and returned as a bound `t`, rather than `AgentPlugins.tsx` calling `useAdminLocale()`/
 * `plugins-i18n` directly.
 */

/** The minimal shape `AgentPluginDetailsModal` actually reads (`plugin.id`/`plugin.displayName`) —
 *  see that component's own narrowed prop type. Kept here, not re-exported from the deleted
 *  `agent-plugin-catalog.ts`, since nothing about it is bundle-specific anymore: any installed
 *  plugin's id plus a human-readable label is enough to open the inspector. */
export interface InspectedAgentPlugin {
  readonly id: string;
  readonly displayName: string;
}

export interface AgentPluginsDependencies {
  port: AgentPluginsPort;
  locale: string;
  t: Translate;
}

export interface AgentPluginsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  agentPlugins: AdminAgentPlugin[] | null;
  error: string | null;
  /** The plugin currently open in the read-only package inspector, or `null` when it's closed. */
  inspectedPlugin: InspectedAgentPlugin | null;
  /** Opens the inspector for `plugin`. */
  inspectPlugin: (plugin: InspectedAgentPlugin) => void;
  /** Closes the inspector. */
  closeInspector: () => void;
  /** Bound translator — `AgentPlugins.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
  /** The raw resolved locale — exposed only because `AgentPlugins.tsx` passes it straight through
   *  to `I18nProvider`'s own `initialLocale`, not because anything here needs it beyond `t`. Same
   *  reasoning as `use-plugins.hooks.ts`'s own `locale` field. */
  locale: string;
}

/**
 * Loads the real installed Agent Plugins for this workspace once on mount.
 *
 * @complexity One GET on mount. No mutation yet — see `agent-plugins-port.hooks.ts`'s own doc for
 * why `AgentPluginsPort` carries no write method.
 */
export function useAgentPlugins({ port, locale, t }: AgentPluginsDependencies): AgentPluginsController {
  const [agentPlugins, setAgentPlugins] = useState<AdminAgentPlugin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectedPlugin, setInspectedPlugin] = useState<InspectedAgentPlugin | null>(null);

  useEffect(() => {
    void port
      .listAgentPlugins()
      .then((r) => setAgentPlugins(r.agentPlugins))
      .catch((e) => setError(describeApiError(e, translatePlugins(locale, "failed to load agent plugins"))));
  }, []);

  return {
    agentPlugins,
    error,
    inspectedPlugin,
    inspectPlugin: setInspectedPlugin,
    closeInspector: () => setInspectedPlugin(null),
    t,
    locale,
  };
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
  const locale = useAdminLocale();
  const t = (key: string): string => translatePlugins(locale, key);
  return useAgentPlugins({ port: defaultAgentPluginsPort, locale, t });
}
