import { useEffect, useState } from "react";
import type { AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "./agent-plugin-surfaces-port.hooks";

/**
 * @file Which admin surfaces one Agent Plugin contributes, for the details modal's extra tabs.
 * A failed listing shows no surface tabs: the modal's own views stay usable either way.
 */

const NONE: readonly AgentPluginSurfaceSummary[] = [];

/** @complexity One GET per `pluginId`. */
export function useAgentPluginSurfaces(
  required: { readonly pluginId: string; readonly port: AgentPluginSurfacesPort },
  _optional: Record<string, never> = {},
): readonly AgentPluginSurfaceSummary[] {
  const { pluginId, port } = required;
  const [state, setState] = useState<{ pluginId: string; surfaces: readonly AgentPluginSurfaceSummary[] }>({ pluginId, surfaces: NONE });
  useEffect(() => {
    let live = true;
    port.list({ pluginId }).then((listing) => { if (live) setState({ pluginId, surfaces: listing.surfaces }); }, () => {});
    return () => { live = false; };
  }, [pluginId, port]);
  return state.pluginId === pluginId ? state.surfaces : NONE;
}
