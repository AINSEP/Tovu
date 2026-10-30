/** Product binding: plugin admission belongs to Jini's host; placement uses the shared
 * partial marker parser/expander. No CMS widget registry or resolver is replaced. */
import { renderPluginWidgetFragments, type PluginContributionRegistry, type PluginActivationRepoPort } from '@jini-ai/plugins/host';
import { markersOfType, PARTIAL_MARKER_TYPE } from '@jini-ai/cms/widgets/markers';
import { validateServerWidgetFragment } from '@jini-ai/cms/widgets/html';
import { expandPartials } from "../../contracts/core/expand-partials.js";
export async function renderPluginWidgetPartials(required: {
  html: string; workspaceId: string; contributions: PluginContributionRegistry;
  activationRepo: PluginActivationRepoPort;
}, _optional: Record<string, never> = {}): Promise<string> {
  const names = markersOfType({ html: required.html, type: PARTIAL_MARKER_TYPE }).flatMap(marker => marker.id ? [marker.id] : []);
  if (!names.length) return required.html;
  const partials = await renderPluginWidgetFragments({ registry: required.contributions, names, workspaceId: required.workspaceId,
    isEnabled: async ({ pluginId }) => (await required.activationRepo.getActivation({ workspaceId: required.workspaceId, pluginId }))?.enabled === true,
    validateHtml: validateServerWidgetFragment,
  });
  const slots = Object.fromEntries(Object.keys(partials).map(name => [name, { source: `${name}.html` }]));
  return expandPartials(required.html, { partials: { ...partials }, manifest: { slots } });
}
