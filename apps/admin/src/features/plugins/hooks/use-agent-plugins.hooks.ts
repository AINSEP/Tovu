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
 * EXTENDED 2026-09-09 (visual redesign): `onToggleEnabled` wires the row's enable/disable switch to
 * `AGENT_PLUGIN_SET_ENABLED`. That is a real activation write — `resolveAgentPluginRefs()` refuses a
 * run pinning a disabled plugin — so the switch's rendered position must always be server truth,
 * never an optimistic guess. See {@link useAgentPlugins}'s own `@tradeoffs`.
 *
 * `describeApiError` here is the shared default from `lib/api.ts`, not this feature's
 * `rules.ts` override — that override's `PLUGIN_NOT_FOUND`/`PLUGIN_INVALID`/`PLUGIN_INCOMPATIBLE`
 * codes belong to the `.tovu-plugin` enable/disable route this screen does not call. This screen's
 * own route answers `AGENT_PLUGIN_NOT_FOUND`/`VALIDATION_ERROR`, neither of which that override
 * knows, so the shared default (which surfaces the server's own message) is the better fit.
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
  /** The last failed toggle's message, or `null`. Separate from `error` (which means "the list
   *  itself could not load"), so a refused toggle does not blank the list the operator is reading. */
  toggleError: string | null;
  /** Plugin ids with an enable/disable request in flight right now. A `Set` rather than the sibling
   *  screen's single `rowSavingId` — see {@link useAgentPlugins}'s `@tradeoffs`. */
  togglingIds: ReadonlySet<string>;
  /** Flips one plugin's activation and replaces that row with the server's answer. */
  onToggleEnabled: (plugin: AdminAgentPlugin) => Promise<void>;
  /** Plugin ids whose row detail panel (keywords, portable components, MCP servers) is open. */
  expandedIds: ReadonlySet<string>;
  /** Opens or closes one row's detail panel. */
  onToggleExpanded: (pluginId: string) => void;
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

/** Adds or removes one id, returning a new `Set` — so React sees an identity change. */
function withId(ids: ReadonlySet<string>, pluginId: string, present: boolean): ReadonlySet<string> {
  const next = new Set(ids);
  if (present) next.add(pluginId);
  else next.delete(pluginId);
  return next;
}

/**
 * Loads the real installed Agent Plugins for this workspace once on mount, and toggles one
 * plugin's activation at a time per row.
 *
 * @complexity One GET on mount, plus one PATCH per toggle. No re-fetch: the route answers with the
 * updated row, which replaces its own entry in place.
 * @tradeoffs No optimistic flip. The switch shows only what the server has confirmed, so a refused
 * or failed toggle can never leave the operator looking at an "on" switch for a plugin that will
 * refuse the next run. The cost is one round-trip of visible latency, which the row's own
 * in-flight state covers.
 *
 * Row replacement goes through `setAgentPlugins`' functional updater rather than closing over the
 * array this render saw. Two rows toggled in quick succession settle independently, and a
 * settlement holding a stale array would otherwise revert the other row's newer answer.
 */
export function useAgentPlugins({ port, locale, t }: AgentPluginsDependencies): AgentPluginsController {
  const [agentPlugins, setAgentPlugins] = useState<AdminAgentPlugin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [inspectedPlugin, setInspectedPlugin] = useState<InspectedAgentPlugin | null>(null);

  useEffect(() => {
    void port
      .listAgentPlugins()
      .then((r) => setAgentPlugins(r.agentPlugins))
      .catch((e) => setError(describeApiError(e, translatePlugins(locale, "failed to load agent plugins"))));
  }, []);

  async function onToggleEnabled(plugin: AdminAgentPlugin): Promise<void> {
    // A second activation of this row's own switch while its request is outstanding is a no-op —
    // the same client-side single-flight discipline `usePlugins` uses, applied per row.
    if (togglingIds.has(plugin.pluginId)) return;
    setTogglingIds((ids) => withId(ids, plugin.pluginId, true));
    setToggleError(null);
    try {
      const { agentPlugin } = await port.setAgentPluginEnabled(plugin.pluginId, { enabled: !plugin.enabled });
      setAgentPlugins((current) =>
        (current ?? []).map((entry) => (entry.pluginId === agentPlugin.pluginId ? agentPlugin : entry)),
      );
    } catch (e) {
      setToggleError(describeApiError(e, translatePlugins(locale, "failed to update agent plugin")));
    } finally {
      setTogglingIds((ids) => withId(ids, plugin.pluginId, false));
    }
  }

  return {
    agentPlugins,
    error,
    toggleError,
    togglingIds,
    onToggleEnabled,
    expandedIds,
    onToggleExpanded: (pluginId: string) => setExpandedIds((ids) => withId(ids, pluginId, !ids.has(pluginId))),
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
