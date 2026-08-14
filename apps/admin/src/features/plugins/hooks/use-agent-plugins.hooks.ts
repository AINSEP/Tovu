import { useState } from "react";

import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as translatePlugins } from "../plugins-i18n";
import type { BundledAgentPlugin } from "../agent-plugin-catalog";
import type { Translate } from "../../../lib/dictionary-translator";

/**
 * @file State for the Agent Plugins screen, so `AgentPlugins.tsx` is only markup — same split as
 * this directory's own `use-plugins.hooks.ts` (`Plugins.tsx`'s hook).
 *
 * No port, and no `<name>-port.hooks.ts`/`<name>-dependencies.hooks.ts` pair: this screen's only
 * data source, `TOVU_BUNDLED_AGENT_PLUGINS` (`agent-plugin-catalog.ts`), is a static, checked-in
 * constant with no host boundary — nothing here performs I/O, so per this migration's own ground
 * rule ("a hook with no I/O gets no port") a port would be ceremony with nothing to inject.
 *
 * `t` (standing i18n rule, 2026-08-11 — see `use-plugins.hooks.ts`'s own header, this screen's
 * sibling in the same directory): resolved here from `useAdminLocale()` and returned as a bound
 * `t`, rather than `AgentPlugins.tsx` calling `useAdminLocale()`/`plugins-i18n` directly.
 */

export interface AgentPluginsController {
  /** The plugin currently open in the read-only package inspector, or `null` when it's closed. */
  inspectedPlugin: BundledAgentPlugin | null;
  /** Opens the inspector for `plugin`. */
  inspectPlugin: (plugin: BundledAgentPlugin) => void;
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
 * @param void — no arguments; there is no port to inject (see this file's own header).
 * @returns The inspector's open/closed plugin plus the bound translator.
 * @complexity Time/space: O(1) — one piece of UI state, no I/O.
 */
export function useAgentPlugins(): AgentPluginsController {
  const locale = useAdminLocale();
  const t = (key: string): string => translatePlugins(locale, key);
  const [inspectedPlugin, setInspectedPlugin] = useState<BundledAgentPlugin | null>(null);

  return {
    inspectedPlugin,
    inspectPlugin: setInspectedPlugin,
    closeInspector: () => setInspectedPlugin(null),
    t,
    locale,
  };
}

/**
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair this codebase uses
 * throughout. Kept as a one-line alias even though there is no port to bind — purely so
 * `AgentPlugins.tsx`'s `useAgentPluginsHook = useWiredAgentPlugins` default prop follows the same
 * grep-able naming every other converted screen in this batch uses.
 *
 * @returns The same controller {@link useAgentPlugins} returns.
 */
export function useWiredAgentPlugins(): AgentPluginsController {
  return useAgentPlugins();
}
