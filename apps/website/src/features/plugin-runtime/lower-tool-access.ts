import { ToolAccessLoweringError, notifyExternalMcpRosterChanged } from '../../assistant/external-mcp-roster-change.js';
import type { PluginProviderFacesPort } from './service-ports.js';

/** A provider's OFF switch also turns its assistant faces off. Use the existing owner lookup once
 * on that explicit decision, never on the answer path. Failures keep the saved OFF decision visible.
 * @complexity O(linked faces) discovery from the existing provider owner, plus bounded Stop/cleanup. */
export async function lowerPluginToolAccess({ pluginId, providerFaces }: {
  pluginId: string; providerFaces?: Pick<PluginProviderFacesPort, 'affectedPluginIds'>;
}, _optional = {}): Promise<void> {
  try {
    const pluginIds = await providerFaces?.affectedPluginIds?.({ pluginId }) ?? [pluginId];
    await notifyExternalMcpRosterChanged({ lowered: { pluginIds } });
  } catch { throw new ToolAccessLoweringError(); }
}
