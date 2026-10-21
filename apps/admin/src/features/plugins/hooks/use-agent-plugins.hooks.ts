import type { AgentPluginSurfaceSummary } from "./agent-plugin-surfaces-port.hooks";
import { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useCallback, useMemo, useState } from "react";

import { ApiError, describeApiError, type AdminAgentPlugin } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { type Translate } from "@jini-ai/ui/panel-kit";
import { t as translatePlugins } from "../plugins-i18n";
import { defaultAgentPluginsPort } from "./agent-plugins-dependencies.hooks";
import type { AgentPluginsPort } from "./agent-plugins-port.hooks";
import { AGENT_PLUGINS_RESOURCE } from "../rules";

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
  /** Set by the row's "Manage" button: the screens it already listed, so the modal opens on the first. */
  readonly surfaces?: readonly AgentPluginSurfaceSummary[];
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
  /** Adds (or replaces) the row the "Add a plugin" upload answered with, so no list re-fetch. */
  onInstalled: (plugin: AdminAgentPlugin) => void;
  /** Plugin ids whose row detail panel (skills, MCP servers) is open. */
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

/** `plugin` in place of the row with its id, keeping the list's order (an update must not move its
 *  row to the end), or appended when it is new. @complexity O(n) in row count. */
function withRow(required: { rows: readonly AdminAgentPlugin[] | null; plugin: AdminAgentPlugin }, _optional: Record<string, never> = {}): AdminAgentPlugin[] {
  const { rows, plugin } = required;
  const current = rows ?? [];
  return current.some((entry) => entry.pluginId === plugin.pluginId)
    ? current.map((entry) => (entry.pluginId === plugin.pluginId ? plugin : entry))
    : [...current, plugin];
}

/** Set-enabled refusals the switch explains in its own words: a plugin this Tovu cannot run, and one
 *  whose interrupted update waits for boot recovery. */
const TOGGLE_REFUSAL_KEYS: Readonly<Record<string, string>> = {
  PLUGIN_HOST_INCOMPATIBLE: "This plugin is not made for this Tovu version.",
  PLUGIN_UPDATE_PENDING: "An earlier update is still being recovered. Restart Tovu and try again.",
};

/**
 * Loads the real installed Agent Plugins for this workspace on mount, and toggles one
 * plugin's activation at a time per row.
 *
 * @complexity One GET on mount, one PATCH per toggle, and GETs after invalidation (toggle,
 * install/uninstall, explicit reload or shared-query refresh). The PATCH response also replaces
 * its row in the shared cache; successful mutations invalidate the list for reconciliation.
 * @tradeoffs No optimistic flip. The switch shows only what the server has confirmed, so a refused
 * or failed toggle can never leave the operator looking at an "on" switch for a plugin that will
 * refuse the next run. The cost is one round-trip of visible latency, which the row's own
 * in-flight state covers.
 *
 * Row replacement reads the shared cache through `loader.peek()` rather than closing over the
 * array this render saw. Two rows toggled in quick succession settle independently, and a
 * settlement holding a stale array would otherwise revert the other row's newer answer.
 */
export function useAgentPlugins({ port, locale, t }: AgentPluginsDependencies): AgentPluginsController {
  const key = useMemo(() => ["agent-plugins", "list"] as const, []);
  const fetchList = useCallback(async () => {
    try { return (await port.listAgentPlugins()).agentPlugins; }
    catch (error) { throw new Error(describeApiError(error, translatePlugins({ locale, key: "failed to load agent plugins" }))); }
  }, [port, locale]);
  const query = useFetchQuery({ key, fetch: fetchList }, { staleTime: 0 });
  const loader = useCachedLoader({ key, fetch: fetchList }, { staleTime: 0 });
  const agentPlugins = query.data ?? null;
  const setAgentPlugins = (update: (current: AdminAgentPlugin[] | null) => AdminAgentPlugin[]) => loader.replace({ value: update(loader.peek() ?? null) });
  const invalidate = useInvalidate();
  const toggle = useFetchMutation({ run: ({ input }: { input: AdminAgentPlugin }) => port.setAgentPluginEnabled(input.pluginId, { enabled: !input.enabled }) }, { invalidates: [["agent-plugins"]] });
  const error = query.error?.message ?? null;
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [inspectedPlugin, setInspectedPlugin] = useState<InspectedAgentPlugin | null>(null);

  const reload = useCallback(async () => { invalidate({ key: ["agent-plugins"] }); }, [invalidate]);

  // A completed assistant install/uninstall must update both tabs without a remount. The shared
  // generation guard prevents a slow earlier read resurrecting the just-removed package.
  useContentRefreshSubscription(AGENT_PLUGINS_RESOURCE, () => { void reload(); });

  async function onToggleEnabled(plugin: AdminAgentPlugin): Promise<void> {
    // A second activation of this row's own switch while its request is outstanding is a no-op —
    // the same client-side single-flight discipline `usePlugins` uses, applied per row.
    if (togglingIds.has(plugin.pluginId)) return;
    setTogglingIds((ids) => withId(ids, plugin.pluginId, true));
    setToggleError(null);
    try {
      const { agentPlugin } = await toggle.mutate({ input: plugin });
      setAgentPlugins((current) =>
        (current ?? []).map((entry) => (entry.pluginId === agentPlugin.pluginId ? agentPlugin : entry)),
      );
    } catch (e) {
      // Lifecycle refusals by name (409), in the operator's language rather than the server's English.
      const known = e instanceof ApiError && e.code ? TOGGLE_REFUSAL_KEYS[e.code] : undefined;
      setToggleError(known ? translatePlugins({ locale, key: known })
        : describeApiError(e, translatePlugins({ locale: locale, key: "failed to update agent plugin" })));
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
    onInstalled: (plugin: AdminAgentPlugin) => {
      // The install response is newer than any pending list read. Keep its row until a later
      // refresh starts rather than letting an earlier snapshot hide the completed install.
      setAgentPlugins((current) => withRow({ rows: current, plugin }));
    },
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
  const t = (key: string): string => translatePlugins({ locale: locale, key: key });
  return useAgentPlugins({ port: defaultAgentPluginsPort, locale, t });
}
