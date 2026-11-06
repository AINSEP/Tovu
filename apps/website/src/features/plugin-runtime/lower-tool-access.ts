import { ToolAccessLoweringError, type NotifyToolAccessChanged } from '../../contracts/core/tool-access-change.js';
import type { PluginProviderFacesPort } from './service-ports.js';

/** A provider's OFF switch also turns its assistant faces off. Use the existing owner lookup once
 * on that explicit decision, never on the answer path. Failures keep the saved OFF decision visible.
 * @complexity O(linked faces) discovery from the existing provider owner, plus bounded Stop/cleanup. */
export async function lowerPluginToolAccess({ pluginId, providerFaces, notifyRosterChanged }: {
  pluginId: string; notifyRosterChanged: NotifyToolAccessChanged; providerFaces?: Pick<PluginProviderFacesPort, 'affectedPluginIds'>;
}, _optional = {}): Promise<void> {
  try {
    const pluginIds = await providerFaces?.affectedPluginIds?.({ pluginId }) ?? [pluginId];
    await notifyRosterChanged({ lowered: { pluginIds } });
  } catch { throw new ToolAccessLoweringError(); }
}
